import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BottomNav } from '../components/BottomNav'
import { BrandMark } from '../components/AppIcon'
import { useGuanyuanGame } from '../game/useGame'
import type { OverlayId, SceneId, SectionId } from '../types'
import type { LocationSceneId, OpenOverlayId } from '../ui/contracts'
import { colors, fonts } from '../ui/theme'
import { TodayScreen } from '../screens/TodayScreen'
import { CasesScreen } from '../screens/CasesScreen'
import { AffairsScreen } from '../screens/AffairsScreen'
import { PeopleScreen } from '../screens/PeopleScreen'
import { LedgerScreen } from '../screens/LedgerScreen'
import { LifeScreen } from '../screens/LifeScreen'
import { DocumentOverlay } from '../overlays/DocumentOverlay'
import { BanquetOverlay, GoalOverlay, PersonOverlay, WorldOverlay } from '../overlays/PeopleEventOverlays'
import { EvidenceOverlay, PlanOverlay, ReviewOverlay, SigningOverlay } from '../overlays/OfficialOverlays'
import { AtlasOverlay, LocationOverlay } from '../overlays/AtlasOverlay'
import { EpilogueOverlay, IntelligenceOverlay, SummaryOverlay } from '../overlays/RecordOverlays'
import { people } from '../data'

export default function GuanyuanApp() {
  const game = useGuanyuanGame()
  const { state } = game
  const [section, setSection] = useState<SectionId>('today')
  const [scene, setScene] = useState<SceneId>('county')
  const [overlay, setOverlay] = useState<OverlayId>(null)
  const [personId, setPersonId] = useState('xiancheng')
  const [location, setLocation] = useState<LocationSceneId>('ferry')
  const [docSelected, setDocSelected] = useState<string[]>([])
  const [ledgerSelected, setLedgerSelected] = useState<string[]>([])

  useEffect(() => {
    if (game.ready && !state.goalId && !overlay) setOverlay('goal')
  }, [game.ready, state.goalId, overlay])

  const openOverlay = (id: OpenOverlayId) => setOverlay(id)
  const closeOverlay = () => setOverlay(null)
  const navigate = (id: SectionId) => { setSection(id); closeOverlay() }
  const changeScene = (id: SceneId) => { setScene(id); setSection('today'); closeOverlay() }
  const openPerson = (id: string) => { setPersonId(id); setOverlay('person') }
  const openLocation = (id: LocationSceneId) => { setLocation(id); setOverlay('location') }
  const toggle = (id: string, selected: string[], setter: (next: string[]) => void) => setter(selected.includes(id) ? selected.filter(item => item !== id) : selected.length < 3 ? [...selected, id] : selected)
  const notifyResult = (result: string, ok: string, repeated: string) => game.notify(result === 'repeated' || result === 'done' ? '此前已经办理' : ok, result === 'repeated' || result === 'done' ? repeated : '新的变化已写入本机存档')
  const person = people.find(item => item.id === personId) ?? people[0]

  if (!game.ready) return <SafeAreaView style={styles.loading}><BrandMark size={64} /><Text style={styles.loadingTitle}>观远</Text><Text style={styles.loadingSub}>正在展开本机案卷</Text><ActivityIndicator color={colors.cinnabar} /></SafeAreaView>

  return <View style={styles.app}>
    {section === 'today' ? <TodayScreen state={state} scene={scene} onScene={setScene} openOverlay={openOverlay} onProbe={() => notifyResult(game.probe(), '东堤探挖已入卷', '探挖记录不会重复生成')} onAudit={() => notifyResult(game.audit(), '旧册借领状已入卷', '旧册已经细查')} onContinueDay={game.continueNextDay} /> : null}
    {section === 'cases' ? <CasesScreen state={state} openOverlay={openOverlay} /> : null}
    {section === 'affairs' ? <AffairsScreen state={state} navigate={navigate} changeScene={changeScene} openOverlay={openOverlay} /> : null}
    {section === 'people' ? <PeopleScreen state={state} openPerson={openPerson} /> : null}
    {section === 'ledger' ? <LedgerScreen state={state} selected={ledgerSelected} onToggle={id => toggle(id, ledgerSelected, setLedgerSelected)} onRemember={() => { const result = game.rememberLedger(ledgerSelected); if (result === 'ok') game.notify('疑点已入情报台账', '账目仍须核问，不提前定罪') }} onAudit={() => notifyResult(game.audit(), '旧册借领状已入卷', '旧册已经细查')} openOverlay={openOverlay} /> : null}
    {section === 'life' ? <LifeScreen state={state} openOverlay={openOverlay} /> : null}
    <BottomNav current={section} onNavigate={setSection} />

    <DocumentOverlay visible={overlay === 'document'} onClose={closeOverlay} state={state} selected={docSelected} onToggle={id => toggle(id, docSelected, setDocSelected)} onRemember={() => { const result = game.rememberDocument(docSelected); if (result === 'ok') game.notify('呈文疑点已入卷', '两版文句与待核问题已保留') }} openOverlay={openOverlay} />
    <PlanOverlay visible={overlay === 'plan'} onClose={closeOverlay} state={state} onPreview={game.markPlanPreview} onConfirm={plan => { if (game.confirmPlan(plan)) { game.notify('抢护已经签押发起', '后续执行与验收仍须等待日程'); closeOverlay() } }} />
    <ReviewOverlay visible={overlay === 'review'} onClose={closeOverlay} state={state} onAction={id => notifyResult(game.runOfficialAction(id), '回文动作已入卷', '此项已经办理')} />
    <EvidenceOverlay visible={overlay === 'evidence'} onClose={closeOverlay} state={state} />
    <SigningOverlay visible={overlay === 'signing'} onClose={closeOverlay} state={state} onOpenPlan={() => setOverlay('plan')} />
    <PersonOverlay visible={overlay === 'person'} onClose={closeOverlay} state={state} person={person} onAsk={() => notifyResult(game.askPerson(person.id), `${person.name}的说法已入台账`, '复述口供不再耗时')} />
    <BanquetOverlay visible={overlay === 'banquet'} onClose={closeOverlay} state={state} onChoose={choice => { if (game.chooseBanquet(choice)) game.notify('今夜取舍已入礼簿', '私囊、人情与三行日志已经更新') }} />
    <WorldOverlay visible={overlay === 'world'} onClose={closeOverlay} state={state} onResolve={(eventId, optionId) => { game.resolveWorldOption(eventId, optionId); game.notify('此事已经落笔', '结果已留入本局记录') }} />
    <GoalOverlay visible={overlay === 'goal'} onClose={closeOverlay} state={state} onSetGoal={game.setGoal} onReset={game.resetGame} />
    <IntelligenceOverlay visible={overlay === 'intelligence'} onClose={closeOverlay} state={state} />
    <SummaryOverlay visible={overlay === 'summary'} onClose={closeOverlay} state={state} openOverlay={openOverlay} />
    <EpilogueOverlay visible={overlay === 'epilogue'} onClose={closeOverlay} state={state} />
    <AtlasOverlay visible={overlay === 'atlas'} onClose={closeOverlay} state={state} openOverlay={openOverlay} openLocation={openLocation} />
    <LocationOverlay visible={overlay === 'location'} onClose={closeOverlay} location={location} openOverlay={openOverlay} changeScene={changeScene} navigate={navigate} />

    {game.toast ? <Pressable onPress={game.dismissToast} style={styles.toast}><View style={styles.toastBody}><Text style={styles.toastTitle}>{game.toast.title}</Text><Text style={styles.toastDetail}>{game.toast.detail}</Text><Text style={styles.toastClose}>点按收起</Text></View></Pressable> : null}
  </View>
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.paper }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.paper }, loadingTitle: { color: colors.ink, fontFamily: fonts.serif, fontSize: 40, letterSpacing: 10 }, loadingSub: { color: colors.muted, fontFamily: fonts.serif, fontSize: 14, marginBottom: 12 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 88 }, toastBody: { backgroundColor: colors.riverDark, borderLeftWidth: 3, borderLeftColor: colors.cinnabar, padding: 15, shadowColor: colors.shadow, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 9 }, toastTitle: { color: colors.paperBright, fontFamily: fonts.serif, fontSize: 16 }, toastDetail: { color: colors.paperDeep, fontSize: 12, lineHeight: 18, marginTop: 4 }, toastClose: { color: '#eee5d588', fontSize: 9, textAlign: 'right', marginTop: 4 },
})
